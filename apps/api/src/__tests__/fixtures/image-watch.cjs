const assert = require("node:assert/strict");
const sharp = require("sharp");
const { transformImage } = require("../../image-worker.ts");
(async () => {
  const input = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#f00" },
  })
    .png()
    .toBuffer();
  for (let index = 0; index < 2; index++) {
    const result = await transformImage(input);
    assert.equal(result.width, 8);
    assert.equal(result.height, 8);
    assert.equal((await sharp(result.content).metadata()).format, "webp");
    if (index === 0)
      await assert.rejects(transformImage(Buffer.from("invalid")), {
        statusCode: 415,
        details: { code: "IMAGE_FORMAT_UNSUPPORTED" },
      });
  }
  console.log("WATCH_CONVERSION_OK");
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
