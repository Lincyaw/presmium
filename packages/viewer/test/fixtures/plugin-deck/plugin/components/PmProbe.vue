<!-- A component written for the slides form: Slidev's template globals and v-click rules. -->
<template>
  <div class="pm-probe" :data-title="$frontmatter?.title" :data-accent="$frontmatter?.accent" :data-page="$page" :data-clicks="$clicks">
    <span v-click class="pm-probe__click">甲</span>
    <span v-after class="pm-probe__after">乙</span>
    <span v-click.hide class="pm-probe__hide">丙</span>
  </div>
</template>
