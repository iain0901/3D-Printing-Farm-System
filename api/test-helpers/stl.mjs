export function testStl(width = 10, depth = 20, height = 30) {
  const vertices = [[-width/2,-depth/2,0],[width/2,-depth/2,0],[-width/2,depth/2,0],[0,0,height]];
  const triangles = [[0,2,1],[0,1,3],[1,2,3],[2,0,3]];
  const buffer = Buffer.alloc(84 + triangles.length * 50);
  buffer.writeUInt32LE(triangles.length, 80);
  triangles.forEach((triangle, i) => triangle.forEach((v, j) => vertices[v].forEach((value, axis) => buffer.writeFloatLE(value, 84+i*50+12+j*12+axis*4))));
  return buffer;
}
