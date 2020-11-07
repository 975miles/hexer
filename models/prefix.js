'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Prefix extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  };
  Prefix.init({
    guild: DataTypes.STRING,
    prefix: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'Prefix',
  });
  return Prefix;
};