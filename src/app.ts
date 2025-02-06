import express from "express";
import "./script";
const port = 2000;
const app = express();
app.use(express.json());

app.listen(() => {
  console.log(`server is running on port${port} `);
});
