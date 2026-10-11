<template>
  <svg class="workshop-art" :class="`art-${kind}`" viewBox="0 0 600 500" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <!-- Original workshop illustrations: solid ink, layered material and technical drawing marks. -->
    <g stroke="#173c43" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
      <template v-if="kind === 'printer'">
        <ellipse cx="304" cy="429" rx="222" ry="35" fill="#b2d9d3" stroke="none" />
        <path d="M124 374 330 453 506 355 305 284Z" fill="#173c43" />
        <path d="M124 351 330 428 506 333 305 260Z" fill="#f7f8ee" />
        <path d="M330 428v25m176-120v22M124 351v23" />
        <path d="M160 136 326 196 472 115 306 60Z" fill="#f7f8ee" />
        <path d="M176 143v207l-16 10V136m296-15v215l16-8V115" fill="#cbd9d4" />
        <path d="m326 196 16-9v213l-16 10Z" fill="#b7c9c5" />
        <path d="M160 136v224l16-10V143m150 53v214l-16-6V190" fill="#f7f8ee" />
        <path d="m186 323 126 47 130-72-126-45Z" fill="#65bdc8" />
        <path
          d="m199 316 112 42 116-64M217 307l110 42m-90-53 108 43m-88-54 106 43m-88-54 106 44m-151-1 112-61m-93 68 113-62m-94 69 113-62m-94 69 113-62"
          stroke="#e8f5ea"
          stroke-width="1.5"
        />
        <path d="M272 309c-27-8-29-22-19-39 10-18 25-33 24-54l45-4c-4 30 3 40 17 56 14 18 6 37-18 45-17 5-33 3-49-4Z" fill="#f07844" />
        <path
          d="M253 279c21 14 65 16 87-2m-90 11c23 15 65 18 91 1m-88 11c24 13 59 15 83 1m-76-32c24 13 53 13 71-1m-63-9c20 9 39 10 55 2m-49-13c16 8 31 9 43 3m-39-14c12 6 24 6 37 2m-36-13c12 4 25 4 36 0"
          stroke="#a44c2a"
          stroke-width="1.6"
        />
        <ellipse cx="299" cy="214" rx="23" ry="8" fill="#ae4c2c" />
        <path d="m178 188 137 50 138-78v-15l-138 77-137-49Z" fill="#173c43" />
        <path d="m268 205 27 10 31-18-26-10Z" fill="#f7f8ee" />
        <path d="m268 205 27 10v29l-27-10Z" fill="#cbd9d4" />
        <path d="m295 215 31-18v30l-31 17Z" fill="#f7f8ee" />
        <path d="m284 241 13 5-4 12-8-3Z" fill="#f2bc52" />
        <path d="M301 190c14-47 100-42 99-108" stroke="#f07844" stroke-width="5" />
        <ellipse cx="405" cy="69" rx="43" ry="53" transform="rotate(24 405 69)" fill="#173c43" />
        <ellipse cx="394" cy="66" rx="39" ry="50" transform="rotate(24 394 66)" fill="#f07844" />
        <ellipse cx="389" cy="64" rx="25" ry="35" transform="rotate(24 389 64)" stroke="#a44c2a" stroke-width="9" />
        <ellipse cx="390" cy="64" rx="10" ry="16" transform="rotate(24 390 64)" fill="#f7f8ee" />
        <path d="m353 404 45-24v14l-45 24Z" fill="#dce980" />
        <path d="m419 373 9-5m8-4 9-5" stroke="#f7f8ee" />
        <path d="M75 262c-41-36-32-92 20-95m-14-9 17 8-9 17" stroke-dasharray="5 7" />
        <path d="m501 213 10-29 10 29 27 9-27 9-10 28-10-28-28-9Z" fill="#dce980" />
        <path d="m90 351 5-15 5 15 15 5-15 5-5 15-5-15-15-5Z" fill="#f07844" />
        <path d="M494 91h22m-11-11v22M89 115l12-12m-12 0 12 12" />
      </template>
      <template v-else-if="kind === 'spool'">
        <ellipse cx="307" cy="410" rx="177" ry="29" fill="#d4c7b3" stroke="none" />
        <path d="M333 104 229 124l5 265 115-26Z" fill="#cf663b" />
        <ellipse cx="335" cy="237" rx="100" ry="139" fill="#183c43" />
        <ellipse cx="305" cy="245" rx="101" ry="139" fill="#e98956" />
        <path
          d="M287 112c105 73 102 196 17 270m-35-264c102 66 113 195 17 268m-38-261c96 63 113 192 19 263"
          stroke="#b95732"
          stroke-width="5"
        />
        <ellipse cx="227" cy="260" rx="104" ry="145" fill="#f5f3e7" />
        <ellipse cx="227" cy="260" rx="84" ry="120" fill="#eacbbc" />
        <ellipse cx="227" cy="260" rx="57" ry="84" fill="#f07844" />
        <ellipse cx="227" cy="260" rx="21" ry="32" fill="#173c43" />
        <path d="m195 163 12 29m50-28-15 31m-66 150 23-27m69 21-20-24" stroke-width="10" stroke="#f5f3e7" />
        <path d="M330 345c15 70 162 30 161 85-1 26-80 34-79 7 0-21 25-21 38-10" stroke="#f07844" stroke-width="7" />
        <path d="M87 187c-26-39 22-89 73-74m-13-13 15 13-20 8" stroke-dasharray="5 7" />
        <path d="m440 156 7-24 7 24 24 7-24 7-7 24-7-24-24-7Z" fill="#dce980" />
      </template>
      <template v-else-if="kind === 'sketch'">
        <g transform="rotate(-9 280 250)">
          <path d="M133 86h290v333H133Z" fill="#d2d9cf" />
          <path d="M121 75h290v333H121Z" fill="#fffdf3" />
          <path d="M146 109h101m-101 15h62M148 363h105m15 0h116" stroke="#9daea6" stroke-width="2" />
          <path d="m184 205 80-45 81 45v95l-81 45-80-45Z" fill="#d9ece5" />
          <path d="m184 205 80 46 81-46m-81 46v94" />
          <path d="m204 216 60-34 61 34v72l-61 34-60-34Z" stroke="#419ba8" stroke-dasharray="4 5" />
          <path d="M160 202v99m-6-99h12m-12 99h12m20 31 71 41m-73-49-3 12m74 30-3 12" stroke-width="1.5" />
        </g>
        <g transform="rotate(28 438 246)">
          <path d="M425 107h27v229l-14 35-13-35Z" fill="#e2ec88" />
          <path d="M425 129h27m-14 1v202m-13 4h27m-21 20 7 15 7-15" />
          <path d="M425 107v22h27v-22Z" fill="#ef997b" />
        </g>
        <path d="M57 250c-30-77 2-109 32-100m-13-12 15 12-16 9M455 397c49-3 67-22 48-56" stroke-dasharray="5 7" />
        <path d="m475 76 5-16 5 16 16 5-16 5-5 16-5-16-16-5Z" fill="#f07844" />
      </template>
      <template v-else>
        <ellipse cx="301" cy="422" rx="206" ry="24" fill="#b6cac0" stroke="none" />
        <path d="m340 259 89-51 85 48v108l-88 52-86-49Z" fill="#e5ee95" />
        <path d="m340 259 86 48 88-51m-88 51v109" />
        <path v-for="n in 9" :key="n" :d="`M341 ${267 + n * 10}l84 48 88-51`" stroke="#a5af62" stroke-width="1" />
        <ellipse cx="426" cy="258" rx="29" ry="16" fill="#173c43" />
        <path
          d="M113 340c-23-35 13-72 33-100 16-24 24-51 19-84h97c-6 35 6 62 27 87 27 33 43 68 20 101-32 41-160 45-196-4Z"
          fill="#ee8b62"
        />
        <ellipse cx="213" cy="156" rx="49" ry="17" fill="#ae5337" />
        <path
          v-for="n in 12"
          :key="`v${n}`"
          :d="`M${175 + n * 6} 171Q${166 + n * 8} 219 ${143 + n * 12} 282Q${135 + n * 14} 330 ${149 + n * 10} 359`"
          stroke="#b25839"
          stroke-width="2"
        />
        <path d="M123 413v-28l69-37 81 44v28l-69 39Z" fill="#73b8c1" />
        <path d="m123 385 81 45 69-38m-69 38v29" />
        <path d="M81 231c-30-53-12-84 39-84m-16-10 18 10-13 13" stroke-dasharray="5 7" />
        <path d="m399 131 9-29 9 29 29 9-29 9-9 29-9-29-29-9Z" fill="#fffdf3" />
      </template>
    </g>
  </svg>
</template>

<script>
  export default { name: 'WorkshopArt', props: { kind: { type: String, default: 'printer' } } }
</script>

<style scoped>
  .workshop-art {
    display: block;
    width: 100%;
    height: auto;
  }
</style>
