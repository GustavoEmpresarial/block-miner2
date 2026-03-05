export function health(_req, res) {
  res.json({ ok: true, message: "BlockMiner online" });
}
