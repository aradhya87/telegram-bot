const { MongoClient } = require('mongodb');
require('dotenv').config();

const client = new MongoClient(process.env.MONGO_URI);

async function test() {
  console.log("⏳ Trying to connect to MongoDB...");

  try {
    await client.connect();
    console.log("✅ Connected successfully to MongoDB");
  } catch (err) {
    console.error("❌ Failed to connect:", err.message);
  } finally {
    await client.close();
    console.log("🔒 Connection closed.");
  }
}

test();
