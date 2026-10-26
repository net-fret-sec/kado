<script setup lang="ts">
defineProps<{ kind: 'hero' | 'private' | 'giving' | 'open' }>()
</script>

<template>
  <span class="gift-illustration" :class="`gift-illustration--${kind}`" aria-hidden="true"></span>
</template>

<style scoped>
/* One shared sheet keeps the four approved illustrations together and loads once. */
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
.gift-illustration--private {
  background-position: 33.333333% 50%;
}
.gift-illustration--giving {
  background-position: 66.666667% 50%;
}
.gift-illustration--open {
  background-position: 100% 50%;
}
</style>
