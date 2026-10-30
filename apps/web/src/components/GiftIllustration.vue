<script setup lang="ts">
defineProps<{ kind: 'hero' | 'private' | 'giving' | 'open' }>()
</script>

<template>
  <span class="gift-illustration" :class="`gift-illustration--${kind}`" aria-hidden="true"></span>
</template>

<style scoped>
/* Keep the original hero and benefit sheets; privacy has its own revised artwork. */
.gift-illustration {
  display: block;
  aspect-ratio: 3 / 4;
  background-image: url('../assets/illustrations/kado-gifts.png');
  background-size: 400% 100%;
  background-repeat: no-repeat;
}
.gift-illustration--hero {
  background-position: 0% 50%;
}
.gift-illustration:not(.gift-illustration--hero) {
  background-image: url('../assets/illustrations/kado-benefits.png');
  background-size: 300% 100%;
  aspect-ratio: 1;
}
.gift-illustration.gift-illustration--private {
  background-image: url('../assets/illustrations/kado-privacy.png');
  background-size: 90% auto;
  background-position: center;
}
.gift-illustration--giving {
  background-position: 50% 50%;
}
.gift-illustration--open {
  background-position: 100% 50%;
}
</style>
