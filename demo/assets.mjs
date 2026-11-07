export const assets = [
  ['benchy-hull.stl', '3DBenchy 船身', '6cc572a7fcfcf7717286887430f6fd5126a9f216bae69d1edaca4d098c3c63a0', 'CC0-1.0'],
  ['benchy-roof.stl', '3DBenchy 船艙頂', '9a5e4a1dee5c32b925c6186b06c44cfaef5f3e504dc02623bb5baf5f3791418a', 'CC0-1.0'],
  ['MINI-base-spoolholder.stl', 'Prusa MINI 料架底座', 'c9ae98121979366fd503a0a8e58cc50599e096fd55c33598c777fa4b32d1b194', 'GPL-3.0'],
  ['MINI-knob.stl', 'Prusa MINI 旋鈕', '487bab50ef7f2b14324b375968dd9a7a23a5b4e8c9bf5764b4e450912498d70c', 'GPL-3.0'],
  ['MINI-fan-spacer.stl', 'Prusa MINI 風扇墊片', '186220f3c7bc4f005c06617c09568f8cc94a67f7f52b91a1916f31fc3e026a59', 'GPL-3.0'],
  ['MINI-y-belt-holder.stl', 'Prusa MINI 皮帶座', 'bf42ae1c4ac2f85cac317d69a94384470fe4976c64debc4e98ecc6794c7e166a', 'GPL-3.0'],
].map(([file, title, sha256, license]) => ({ file, title, sha256, license }));

export const sourceHashes = {
  'MINI-base-spoolholder.ipt': '25451139267345063b44acfb746533845abc86e9ae515fbb14c748363505669e',
  'MINI-knob.ipt': 'c67ec746b5368304188c521f61b60f41bd709f8b96148d98ceef803f2075dc63',
  'MINI-fan-spacer.ipt': '2981155f2088b2ce50b3b488914039c4d9a4e8a02826904ed4b317b6926b7656',
  'MINI-y-belt-holder.ipt': 'ca9f88da9bd7a4902ce9801eea3341b8cc6efbd831d4aa1eb94105899cc8c780',
};
