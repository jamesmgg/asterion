import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./tests', testMatch:'*.spec.ts', timeout:45000, workers:1,
 use:{baseURL:process.env.BASE_URL || 'http://localhost:8787', headless:true, screenshot:'only-on-failure', trace:'retain-on-failure', launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
 reporter:[['list']], outputDir:'test-results',
});
