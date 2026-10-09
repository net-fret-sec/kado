const sharp = require("sharp");
sharp.cache(false);
sharp.concurrency(1);
process.on("message", function onMessage(message) {
  if (message?.type !== "kado:image:transform") return;
  process.off("message", onMessage);
  void transform(message);
});
async function transform({ content, limits }) {
  try {
    const input = Buffer.from(content);
    const jpeg = input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
    const png = input
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const webp =
      input.toString("ascii", 0, 4) === "RIFF" &&
      input.toString("ascii", 8, 12) === "WEBP";
    if (!jpeg && !png && !webp)
      throw { code: "IMAGE_FORMAT_UNSUPPORTED", status: 415 };
    // libvips can decode only the first APNG frame: detect the animation chunk explicitly.
    if (png) {
      for (let offset = 8; offset + 12 <= input.length; ) {
        const length = input.readUInt32BE(offset);
        if (length > input.length - offset - 12) break;
        if (input.toString("ascii", offset + 4, offset + 8) === "acTL")
          throw { code: "IMAGE_FORMAT_UNSUPPORTED", status: 415 };
        offset += length + 12;
      }
    }
    const image = sharp(input, {
      limitInputPixels: limits.pixels,
      animated: true,
      failOn: "warning",
    });
    const meta = await image.metadata();
    if (
      !["jpeg", "png", "webp"].includes(meta.format) ||
      (meta.pages || 1) !== 1
    )
      throw { code: "IMAGE_FORMAT_UNSUPPORTED", status: 415 };
    if (!meta.width || !meta.height || meta.width * meta.height > limits.pixels)
      throw { code: "IMAGE_TOO_LARGE", status: 413 };
    const { data, info } = await image
      .rotate()
      .resize({
        width: limits.dimension,
        height: limits.dimension,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    if (data.length > limits.outputBytes)
      throw { code: "IMAGE_TOO_LARGE", status: 413 };
    process.send(
      {
        type: "kado:image:result",
        content: data,
        width: info.width,
        height: info.height,
      },
      () => process.exit(0),
    );
  } catch (e) {
    const large = /pixel limit/.test(e.message || "");
    process.send(
      {
        type: "kado:image:result",
        error: e.code || (large ? "IMAGE_TOO_LARGE" : "IMAGE_INVALID_FILE"),
        status: e.status || (large ? 413 : 400),
      },
      () => process.exit(0),
    );
  }
}
