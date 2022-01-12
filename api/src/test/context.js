const { randomBytes } = require("crypto");
const format = require("pg-format");
const { default: migrate } = require("node-pg-migrate");
const pool = require("../pool");

const DEFAULT_OPTS = {
  host: "localhost",
  port: 5432,
  database: "socialnetwork-test",
  user: "postgres",
  password: "postgres",
};

class Context {
  static async build() {
    // generate a role name to connect to db
    const roleName = "a" + randomBytes(4).toString("hex");

    // connect as usual
    await pool.connect(DEFAULT_OPTS);

    // create a new role
    await pool.query(
      format("CREATE ROLE %I WITH LOGIN PASSWORD %L;", roleName, roleName)
    );

    // create a schema with the same name
    await pool.query(
      format("CREATE SCHEMA %I AUTHORIZATION %I", roleName, roleName)
    );

    // disconnect
    await pool.close();

    // run migrations in the new schema
    await migrate({
      schema: roleName,
      direction: "up",
      log: () => {},
      noLock: true,
      dir: "migrations",
      databaseUrl: {
        host: "localhost",
        port: 5432,
        database: "socialnetwork-test",
        user: roleName,
        password: roleName,
      },
    });

    // connect to pg as the newly created role
    await pool.connect({
      host: "localhost",
      port: 5432,
      database: "socialnetwork-test",
      user: roleName,
      password: roleName,
    });

    return new Context(roleName);
  }

  constructor(roleName) {
    this.roleName = roleName;
  }

  async reset() {
    return pool.query(`
      DELETE FROM users;
    `);
  }

  async close() {
    // disconnect(
    await pool.close();

    // reconnect as root
    await pool.connect(DEFAULT_OPTS);

    // delete the role and schema
    await pool.query(format("DROP SCHEMA %I CASCADE;", this.roleName));
    await pool.query(format("DROP ROLE %I;", this.roleName));

    // disconnect
    await pool.close();
  }
}

module.exports = Context;
