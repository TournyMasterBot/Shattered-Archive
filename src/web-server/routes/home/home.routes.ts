import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.send("Hello from Home MyHome!");
});

router.get("/acknowledgements", (req, res) => {
  res.send("Hello from Home Acknowledgements!");
});

router.get("/feedback", (req, res) => {
  res.send("Hello from Home Feedback!");
});

router.get("/changelog", (req, res) => {
  res.send("Hello from Home Changelog!");
});

router.get("/privacy", (req, res) => {
  res.send("Hello from Home Privacy!");
});

export default router;
