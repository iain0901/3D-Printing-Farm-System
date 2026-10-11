<template>
  <workshop-art v-if="kind === 'sketch'" kind="sketch" />
  <svg v-else class="service-illustration" viewBox="0 0 600 460" fill="none" aria-hidden="true">
    <g stroke="#173c43" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
      <ellipse cx="300" cy="397" rx="218" ry="25" fill="#173c4315" stroke="none" />
      <path d="M71 178c-24-56 11-91 57-76m-13-13 15 13-18 7" stroke-dasharray="5 8" />
      <path d="m494 105 7-22 7 22 22 7-22 7-7 22-7-22-22-7Z" fill="#f7f6ed" />
      <template v-if="kind === 'research'">
        <path d="m112 334 145-68 224 78-150 77Z" fill="#fffdf3" />
        <path d="m112 334 219 76 150-66v18l-150 69-219-77Z" fill="#abc6c5" />
        <path d="M248 300V146h21v145Z" fill="#173c43" />
        <path d="m245 142 88-47 11 18-86 48Z" fill="#f1a37c" />
        <path d="m329 94 24-13 46 65-29 18Z" fill="#fffdf3" />
        <path d="m370 164 29-18 10 15-29 18Z" fill="#173c43" />
        <path d="m218 289 82-38 70 23-82 39Z" fill="#7cbcc7" />
        <path d="m225 314 74-32 36 13-74 34Z" fill="#173c43" />
        <path d="m298 242 17-9 18 6-17 9Z" fill="#e3ed97" />
        <path d="M376 320v-73l42-21 49 15v73l-42 22Z" fill="#e3ed97" />
        <path d="m376 247 49 15 42-21m-42 21v74" />
        <path d="m390 281 23 7v29l-23-8Z" fill="#173c43" />
        <path d="M146 266v-46l44-21 36 12v45l-44 23Z" fill="#ef9369" />
        <path d="m146 220 36 12 44-21m-44 21v47" />
        <path d="M196 368h34m-20-17 30 9m184-146v-33m-6 6 6-6 6 6" stroke-width="2" />
      </template>
      <template v-else-if="kind === 'engineering'">
        <path d="m159 255 143-72 151 57v112l-143 72-151-58Z" fill="#78b8c3" />
        <path d="m159 255 151 58 143-73m-143 73v111" />
        <path d="m182 256 122-57 119 43-115 58Z" fill="#173c43" />
        <path d="m180 256 10 41 112 43 111-56 10-42" fill="#c0d6cc" />
        <path d="m191 146 116-57 119 46-116 56Z" fill="#fffdf3" />
        <path d="m191 146 119 45 116-56v18l-116 57-119-45Z" fill="#e3ed97" />
        <ellipse cx="308" cy="141" rx="29" ry="14" fill="#173c43" />
        <path d="M205 177v58m208-66v54m-102-13v69" stroke-dasharray="5 7" stroke-width="2" />
        <path d="m188 291 95 37v28l-95-36Z" fill="#fffdf3" />
        <path d="m332 342 12-6m8-4 12-6m8-4 12-6m8-4 12-6" stroke-width="5" />
        <path d="M105 206v141m-8-141h16m-16 141h16M171 398l116 44m-119-52 2 15m116 26 2 16" stroke-width="1.5" />
        <circle cx="475" cy="329" r="23" fill="#ef9369" />
        <circle cx="475" cy="329" r="10" fill="#fffdf3" />
      </template>
      <template v-else-if="kind === 'batch'">
        <g v-for="(part, i) in batchParts" :key="i" :transform="`translate(${part[0]} ${part[1]})`">
          <path d="m0 37 68-35 73 27v59l-68 36L0 96Z" :fill="i === 0 ? '#ef9369' : '#e3ed97'" />
          <path d="m0 37 73 28 68-36m-68 36v59" />
          <ellipse cx="71" cy="34" rx="21" ry="11" fill="#173c43" />
          <path d="m9 60 54 21m-54-10 54 21m-54-10 54 21" stroke-width="1" opacity=".45" />
        </g>
        <path d="m99 338 35 13-16 23-36-13Z" fill="#fffdf3" />
        <path d="m93 354 8 6 18-11" />
        <path d="M434 365c53 15 81-10 64-47m-7 13 7-15 12 10" stroke-dasharray="5 8" />
      </template>
      <template v-else-if="kind === 'keepsake'">
        <path d="m133 290 167-79 171 62-167 91Z" fill="#e3ed97" />
        <path d="m133 290 171 74 167-91v28l-167 89-171-72Z" fill="#fffdf3" />
        <path d="M207 263v-91l94-56 97 41v95l-98 55Z" fill="#ef9369" />
        <path d="m207 172 94 40 97-55m-97 55v95" />
        <path d="m236 208 39 17v49l-39-17Z" fill="#fffdf3" />
        <path d="m323 224 48-27v12l-48 27m0 7 48-27v12l-48 27" stroke-width="2" />
        <path d="m294 113 12-36 20 8-12 37" fill="#7cbcc7" />
        <ellipse cx="421" cy="343" rx="52" ry="29" transform="rotate(-24 421 343)" fill="#7cbcc7" />
        <ellipse cx="421" cy="337" rx="52" ry="29" transform="rotate(-24 421 337)" fill="#fffdf3" />
        <path d="m407 329 11-13 8 11 18-2-12 13 1 15-15-5-16 8 4-17-11-7Z" fill="#ef9369" />
        <path d="M147 143c-15 25 12 45 26 19 9-18-15-25-12-2" stroke="#c06d48" stroke-width="5" />
      </template>
      <template v-else-if="kind === 'exhibition'">
        <path d="m140 142 158-63 164 61v233l-164 53-158-58Z" fill="#fffdf3" />
        <path d="M298 79v347m-158-58 158-66 164 71" stroke="#a4bbb4" />
        <path d="m197 315 102-46 109 39v65l-109 46-102-39Z" fill="#78b8c3" />
        <path d="m197 315 102 39 109-46m-109 46v65" />
        <path d="M241 292c-15-26 3-52 16-72 11-15 18-31 14-52h58c-2 24 9 40 21 59 17 24 19 43 3 61-27 27-85 28-112 4Z" fill="#ef9369" />
        <ellipse cx="300" cy="168" rx="29" ry="11" fill="#b96645" />
        <path
          d="M279 179c3 57-50 77-23 114m36-111c7 54-21 89-10 119m24-118c5 50 31 84 14 115m0-120c-3 46 53 78 23 113"
          stroke="#b96645"
          stroke-width="2"
        />
        <path d="m162 161 56-24m-56 36 42-17m151-31 59 24" stroke-width="5" />
        <path d="m74 358 44 17v-56l-44-17Zm23 8v29m-14 4 27-9" fill="#e3ed97" />
      </template>
      <template v-else-if="kind === 'rush'">
        <path d="m152 259 129-63 140 51v112l-130 69-139-56Z" fill="#ef9369" />
        <path d="m152 259 139 54 130-66m-130 66v115" />
        <path d="m207 233 136 54 24-12-137-54Z" fill="#fffdf3" />
        <path d="m213 284 27 11v55l-27-10Z" fill="#fffdf3" />
        <circle cx="379" cy="165" r="82" fill="#fffdf3" />
        <circle cx="379" cy="165" r="67" fill="#e3ed97" />
        <path d="M379 113v53l33 18m-33-92v10m0 123v10m-73-70h10m125 0h10" stroke-width="5" />
        <circle cx="379" cy="165" r="6" fill="#173c43" />
        <path d="M101 231h54m-78 21h42m-35 24h33" stroke-width="5" />
        <path d="m309 337 55-28v27l-55 28Z" fill="#fffdf3" />
        <path d="m319 339 36-18" />
      </template>
      <template v-else>
        <path d="m127 324 146-74 222 77-145 87Z" fill="#fffdf3" />
        <path d="m162 290 89-43 67 25v73l-91 45-65-26Z" fill="#78b8c3" />
        <path d="m162 290 65 26 91-44m-91 44v74" />
        <ellipse cx="239" cy="276" rx="33" ry="15" fill="#173c43" />
        <path d="M215 281V150l16-8v139m9-2 16-104 14 4-14 99" fill="#e3ed97" />
        <path d="m342 176 63 23-20 113-63-22Z" fill="#173c43" />
        <path d="m350 188 43 16-16 89-43-16Z" fill="#e3ed97" />
        <path d="m319 301 48 18 30-11-48-17Zm0 0-8 40 51 19 35-17v-35l-30 11-8 22-48-18" fill="#ef9369" />
        <path d="M438 250v48m-8-40 16 33m-23-13h31" stroke-width="2" />
      </template>
    </g>
  </svg>
</template>
<script>
  import WorkshopArt from './WorkshopArt.vue'
  export default {
    name: 'ServiceArt',
    components: { WorkshopArt },
    props: { kind: { type: String, default: 'everyday' } },
    data: () => ({
      batchParts: [
        [235, 97],
        [365, 148],
        [95, 171],
        [229, 226],
      ],
    }),
  }
</script>
<style scoped>
  .service-illustration {
    display: block;
    width: 100%;
    height: auto;
  }
</style>
