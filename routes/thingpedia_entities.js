// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const express = require('express');
const multer = require('multer');
const csurf = require('csurf');
const csv = require('csv');
const fs = require('fs');

const db = require('../util/db');
const model = require('../model/entity');
const schemaModel = require('../model/schema');
const user = require('../util/user');
const platform = require('../util/platform');
const tokenizer = require('../util/tokenize');
const iv = require('../util/input_validation');
const { BadRequestError, ForbiddenError } = require('../util/errors');

var router = express.Router();

/**
    frequently appearing tokens in the company stock dataset
     41 bancshares
     41 index
     41 technology
     43 ishares
     47 trust
     48 energy
     49 incorporated
     51 capital
     52 limited
     58 systems
     64 fund
     66 first
     69 pharmaceuticals
     78 technologies
     79 company
     83 holdings
     87 international
    120 ltd
    125 group
    137 financial
    144 corp
    159 bancorp
    471 corporation
*/
/*const IGNORED_WORDS = new Set(["in", "is", "of", "or", "not", "at", "as", "by", "my", "i", "from", "for", "an",
    "on", "a", "to", "with", "and", "when", "notify", "monitor", "it",
    "me", "the", "if", "abc", "def", "ghi", "jkl", "mno", "pqr", "stu", "vwz",

    "bancshares", "index", "technology", "ishares", "trust", "energy", "incorporated", "capital",
    "limited", "systems", "fund", "first", "pharmaceuticals", "technologies", "company", "holdings",
    "international", "ltd", "group", "financial", "corp", "bancorp", "corporation"]);*/

async function doCreate(req, res) {
    const language = 'en';

    try {
        await db.withTransaction(async (dbClient) => {
            let match = NAME_REGEX.exec(req.body.entity_id);
            if (match === null)
                throw new BadRequestError(req._("Invalid entity type ID."));

            let [, prefix, /*suffix*/] = match;

            if ((req.user.roles & user.Role.THINGPEDIA_ADMIN) === 0) {
                try {
                    const row = await schemaModel.getByKind(dbClient, prefix);
                    if (row.owner !== req.user.developer_org) throw new Error();
                } catch (e) {
                    throw new ForbiddenError(req._("The prefix of the entity ID must correspond to the ID of a Thingpedia device owned by your organization."));
                }
            }

            await model.create(dbClient, {
                name: req.body.entity_name,
                id: req.body.entity_id,
                is_well_known: false,
                has_ner_support: !req.body.no_ner_support
            });

            if (req.body.no_ner_support)
                return;

            if (!req.files.upload || !req.files.upload.length)
                throw new BadRequestError(req._("You must upload a CSV file with the entity values."));

            let insertBatch = [];

            function insert(entityId, entityValue, entityCanonical, entityName) {
                insertBatch.push([language, entityId, entityValue, entityCanonical, entityName]);
                if (insertBatch.length < 100)
                    return Promise.resolve();

                let batch = insertBatch;
                insertBatch = [];
                return db.insertOne(dbClient,
                    "insert ignore into entity_lexicon(language,entity_id,entity_value,entity_canonical,entity_name) values ?", [batch]);
            }
            function finish() {
                if (insertBatch.length === 0)
                    return Promise.resolve();
                return db.insertOne(dbClient,
                    "insert ignore into entity_lexicon(language,entity_id,entity_value,entity_canonical,entity_name) values ?", [insertBatch]);
            }

            const parser = csv.parse({ delimiter: ',' });
            fs.createReadStream(req.files.upload[0].path).pipe(parser);

            const promises = [];
            await new Promise((resolve, reject) => {
                parser.on('data', (row) => {
                    if (row.length !== 2)
                        return;

                    const value = row[0].trim();
                    const name = row[1];

                    const tokens = tokenizer.tokenize(name);
                    const canonical = tokens.join(' ');
                    promises.push(insert(req.body.entity_id, value, canonical, name));
                });
                parser.on('error', (e) => {
                    reject(new BadRequestError(e.message));
                });
                parser.on('end', resolve);
            });
            await Promise.all(promises);
            await finish();
        });

        res.redirect(303, '/thingpedia/entities');
    } finally {
        if (req.files.upload && req.files.upload.length)
            await Q.nfcall(fs.unlink, req.files.upload[0].path);
    }
}

router.post('/create', multer({ dest: platform.getTmpDir() }).fields([
    { name: 'upload', maxCount: 1 }
]), csurf({ cookie: false }),
    user.requireLogIn, user.requireDeveloper(),
    iv.validatePOST({ entity_id: 'string', entity_name: 'string', no_ner_support: 'boolean' }), async (req, res, next) => {
    doCreate(req, res).catch(next);
});

router.use(csurf({ cookie: false }));

router.get('/', (req, res, next) => {
    db.withClient((dbClient) => {
        return model.getAll(dbClient);
    }).then((rows) => {
        res.render('thingpedia_entity_list', { page_title: req._("Thingpedia - Entity Types"),
                                               csrfToken: req.csrfToken(),
                                               entities: rows });
    }).catch(next);
});

router.get('/by-id/:id', (req, res, next) => {
    db.withClient((dbClient) => {
        return Q.all([model.get(dbClient, req.params.id), model.getValues(dbClient, req.params.id)]);
    }).then(([entity, values]) => {
        res.render('thingpedia_entity_values', { page_title: req._("Thingpedia - Entity Values"),
                                                 entity: entity,
                                                 values: values });
    }).catch(next);
});

const NAME_REGEX = /([A-Za-z_][A-Za-z0-9_.-]*):([A-Za-z_][A-Za-z0-9_]*)/;

module.exports = router;
