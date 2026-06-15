// 一次性工具：解析 GLB 的 JSON chunk，打印结构 + 本地包围盒。用完可删。
const fs = require("fs");

function parseGLB(path) {
  const buf = fs.readFileSync(path);
  if (buf.toString("utf8", 0, 4) !== "glTF") return null;
  const version = buf.readUInt32LE(4);
  const total = buf.readUInt32LE(8);
  let off = 12;
  const len0 = buf.readUInt32LE(off);
  off += 8;
  const json = JSON.parse(buf.toString("utf8", off, off + len0));
  return { version, total, json };
}

for (const p of process.argv.slice(2)) {
  const r = parseGLB(p);
  console.log("=== " + p + " ===");
  if (!r) {
    console.log("  not a GLB");
    continue;
  }
  const j = r.json;
  console.log("glTF v" + r.version, "fileBytes", r.total, "(" + (r.total / 1048576).toFixed(1) + " MB)");
  console.log("generator:", j.asset && j.asset.generator);
  console.log(
    "counts: nodes",
    (j.nodes || []).length,
    "meshes",
    (j.meshes || []).length,
    "materials",
    (j.materials || []).length,
    "textures",
    (j.textures || []).length,
    "images",
    (j.images || []).length,
    "animations",
    (j.animations || []).length,
  );
  const nodeNames = (j.nodes || []).map((n) => n.name).filter(Boolean);
  const meshNames = (j.meshes || []).map((m) => m.name).filter(Boolean);
  const matNames = (j.materials || []).map((m) => m.name).filter(Boolean);
  console.log("node names (≤80):", nodeNames.slice(0, 80).join(" | "));
  console.log("mesh names (≤80):", meshNames.slice(0, 80).join(" | "));
  console.log("material names:", matNames.join(" | "));
  // 顶点总数 + POSITION 包围盒（本地，忽略节点变换）
  let verts = 0;
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (const m of j.meshes || [])
    for (const prim of m.primitives || []) {
      const a = prim.attributes && prim.attributes.POSITION;
      if (a == null) continue;
      const acc = j.accessors[a];
      if (acc) {
        verts += acc.count || 0;
        if (acc.min && acc.max) for (let i = 0; i < 3; i++) {
          mn[i] = Math.min(mn[i], acc.min[i]);
          mx[i] = Math.max(mx[i], acc.max[i]);
        }
      }
    }
  console.log("total verts:", verts);
  console.log(
    "local bbox min",
    mn.map((v) => +v.toFixed(2)),
    "max",
    mx.map((v) => +v.toFixed(2)),
    "size",
    mx.map((v, i) => +(v - mn[i]).toFixed(2)),
  );
}
