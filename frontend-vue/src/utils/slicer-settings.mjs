// Empty advanced fields inherit the real engine profile; editing a field creates an explicit override.
export const slicerSettingFields = [
  { id: 'lineWidth', label: '走線寬度', group: '品質', unit: 'mm', min: 0.24, max: 1, step: 0.01, orca: 'line_width' },
  {
    id: 'seamPosition',
    label: '縫線位置',
    group: '品質',
    choices: [
      ['aligned', '對齊'],
      ['nearest', '最近'],
      ['back', '背面'],
      ['random', '隨機'],
    ],
    orca: 'seam_position',
  },
  {
    id: 'infillPattern',
    label: '填充圖案',
    group: '強度',
    choices: [
      ['gyroid', '螺旋體'],
      ['grid', '網格'],
      ['rectilinear', '直線'],
      ['honeycomb', '蜂巢'],
      ['adaptivecubic', '自適應立方'],
    ],
    orca: 'sparse_infill_pattern',
  },
  { id: 'topLayers', label: '頂部實心層數', group: '強度', min: 0, max: 20, step: 1, orca: 'top_shell_layers' },
  { id: 'bottomLayers', label: '底部實心層數', group: '強度', min: 0, max: 20, step: 1, orca: 'bottom_shell_layers' },
  { id: 'outerWallSpeed', label: '外壁速度', group: '速度', unit: 'mm/s', min: 5, max: 300, step: 1, orca: 'outer_wall_speed' },
  { id: 'innerWallSpeed', label: '內壁速度', group: '速度', unit: 'mm/s', min: 5, max: 300, step: 1, orca: 'inner_wall_speed' },
  { id: 'infillSpeed', label: '填充速度', group: '速度', unit: 'mm/s', min: 5, max: 300, step: 1, orca: 'sparse_infill_speed' },
  { id: 'travelSpeed', label: '空走速度', group: '速度', unit: 'mm/s', min: 10, max: 500, step: 1, orca: 'travel_speed' },
  { id: 'initialLayerSpeed', label: '首層速度', group: '速度', unit: 'mm/s', min: 5, max: 100, step: 1, orca: 'initial_layer_speed' },
  {
    id: 'supportType',
    label: '支撐種類',
    group: '支撐',
    choices: [
      ['tree(auto)', '樹狀自動'],
      ['normal(auto)', '一般自動'],
    ],
    orca: 'support_type',
  },
  {
    id: 'supportOnBuildPlate',
    label: '支撐位置',
    group: '支撐',
    choices: [
      [false, '所有需要支撐的位置'],
      [true, '僅列印平台'],
    ],
    orca: 'support_on_build_plate_only',
  },
  { id: 'supportAngle', label: '支撐懸垂角度', group: '支撐', unit: '°', min: 0, max: 85, step: 1, orca: 'support_threshold_angle' },
  { id: 'brimWidth', label: '裙邊寬度', group: '其他', unit: 'mm', min: 0, max: 20, step: 0.5, orca: 'brim_width' },
  { id: 'skirtLoops', label: '外圍輪廓圈數', group: '其他', min: 0, max: 10, step: 1, orca: 'skirt_loops' },
  { id: 'raftLayers', label: '筏式底座層數', group: '其他', min: 0, max: 5, step: 1, orca: 'raft_layers' },
  { id: 'retractionLength', label: '回抽距離', group: '其他', unit: 'mm', min: 0, max: 10, step: 0.1, machine: 'retraction_length' },
  { id: 'retractionSpeed', label: '回抽速度', group: '其他', unit: 'mm/s', min: 1, max: 80, step: 1, machine: 'retraction_speed' },
]
export const slicerSettingGroups = ['品質', '強度', '速度', '支撐', '其他']
