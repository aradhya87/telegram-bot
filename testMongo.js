const { MongoClient } = require("mongodb");
require("dotenv").config();

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

async function test() {
  try {
    await client.connect();
    console.log("✅ Manual Test: Connected to MongoDB");
  } catch (err) {
    console.error("❌ Manual Test: Failed to connect", err);
  } finally {
    await client.close();
  }
}

test();
