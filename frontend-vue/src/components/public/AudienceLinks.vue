<template>
  <section class="audience-links studio-wrap" aria-labelledby="audience-links-title">
    <div class="audience-links-heading">
      <div>
        <p class="studio-kicker">應用領域</p>
        <h2 id="audience-links-title">你的產業，我們的製作起點。</h2>
      </div>
      <router-link to="/services">看全部用途 ↗</router-link>
    </div>
    <div class="audience-links-grid">
      <router-link
        v-for="audience in audiences"
        :key="audience.id"
        :to="`/for/${audience.id}`"
        class="audience-link"
        :style="{ '--audience-color': audience.color }"
      >
        <div class="audience-link-art">
          <span>{{ audience.number }} ／ {{ audience.shortTitle }}</span>
        </div>
        <h3>
          {{ audience.title }}
          <span aria-hidden="true">↗</span>
        </h3>
        <p>{{ audience.description }}</p>
        <span class="audience-link-topics">{{ topics(audience.id) }}</span>
      </router-link>
    </div>
  </section>
</template>
<script>
  import { audiences, servicesForAudience } from '@/content/fdmServices.mjs'
  export default {
    name: 'AudienceLinks',
    data: () => ({ audiences }),
    methods: {
      topics(id) {
        return servicesForAudience(id)
          .map((item) => item.title)
          .join('・')
      },
    },
  }
</script>
<style scoped>
  .audience-links {
    padding-block: 75px;
  }
  .audience-links-heading {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    align-items: end;
    margin-bottom: 30px;
  }
  .audience-links-heading h2 {
    font-size: clamp(28px, 3vw, 40px);
    margin: 15px 0 0;
    letter-spacing: -0.04em;
  }
  .audience-links-heading > a {
    font-size: 14px;
    border-bottom: 1px solid;
    white-space: nowrap;
  }
  .audience-links-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 28px;
  }
  .audience-link {
    min-width: 0;
    border-top: 2px solid #17343d;
    padding: 22px 24px;
    background: #f0f3ee;
    transition: background 0.2s;
  }
  .audience-link:hover {
    background: #e5eee9;
  }
  .audience-link-art {
    color: #367886;
  }
  .audience-link-art > span {
    font-size: 11px;
  }
  .audience-link-art .studio-image {
    aspect-ratio: 3 / 2;
    max-height: 220px;
    object-fit: contain;
    transition: transform 0.2s;
  }
  .audience-link:hover .studio-image {
    transform: translateY(-5px);
  }
  .audience-link h3 {
    font-size: 22px;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin: 20px 0 10px;
  }
  .audience-link p {
    font-size: 14px;
    color: #576c66;
    line-height: 1.85;
    margin: 0 0 15px;
  }
  .audience-link-topics {
    display: block;
    font-size: 11px;
    border-top: 1px solid #c4cfc4;
    padding-top: 13px;
    line-height: 1.8;
  }
  @media (max-width: 760px) {
    .audience-links {
      padding-block: 48px;
    }
    .audience-links-heading {
      display: block;
    }
    .audience-links-heading > a {
      display: inline-block;
      margin-top: 15px;
    }
    .audience-links-grid {
      grid-template-columns: 1fr;
      gap: 30px;
    }
    .audience-link-art .studio-image {
      max-height: 240px;
    }
    .audience-links-heading .studio-kicker {
      font-size: 10px;
    }
  }
</style>
