import { test, expect } from '@playwright/test'

test('category picker has no duplicate labels', async ({ page }) => {
  await page.goto('/#/vocab-flashcards')
  const labels = await page.getByRole('button').allInnerTexts()
  expect(new Set(labels).size).toBe(labels.length)
})

test('selecting a category and starting shows a session', async ({ page }) => {
  await page.goto('/#/vocab-flashcards')
  await page.getByRole('button', { name: 'Numbers', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start (1 selected)' })).toBeVisible()
  await page.getByRole('button', { name: 'Start (1 selected)' }).click()
  await expect(page).toHaveURL(/#\/vocab-flashcards\/numbers$/)
  await expect(page.getByText('Practicing: Numbers')).toBeVisible()
  await expect(page.getByText(/^Card 0 \/ \d+$/)).toBeVisible()
})

test('reveal shows the meaning and grading advances the session', async ({ page }) => {
  await page.goto('/#/vocab-flashcards/colors')
  await expect(page.getByText('Card 0 / 6')).toBeVisible()

  await page.getByRole('button', { name: 'Reveal' }).click()
  await expect(page.getByRole('button', { name: 'Good' })).toBeVisible()

  await page.getByRole('button', { name: 'Good' }).click()
  await expect(page.getByText('Card 1 / 6')).toBeVisible()
})
