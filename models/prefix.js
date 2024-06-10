const { model, Schema } = require('mongoose');

let prefixSchema = new Schema({
  Guild: String,
  Prefix: String,
});

module.exports = model('prefix', prefixSchema);