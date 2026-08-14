import { test, expect } from '@playwright/test'

test('scope picker has no duplicate row labels', async ({ page }) => {
  await page.goto('/#/flashcards')
  const labels = await page.getByRole('button').allInnerTexts()
  const rowLabels = labels.filter((t) => t.endsWith(' row'))
  expect(new Set(rowLabels).size).toBe(rowLabels.length)
})

test('selecting multiple rows practices the union of their cards', async ({ page }) => {
  await page.goto('/#/flashcards')

  await page.getByRole('button', { name: 'A row', exact: true }).click()
  await page.getByRole('button', { name: 'K row', exact: true }).click()
  await page.getByRole('button', { name: 'S row', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start (3 selected)' })).toBeVisible()

  await page.getByRole('button', { name: 'Start (3 selected)' }).click()

  await expect(page).toHaveURL(/#\/flashcards\/a,k,s$/)
  await expect(page.getByText('Practicing: A row, K row, S row')).toBeVisible()
  await expect(page.getByText('Card 0 / 15')).toBeVisible()
})

test('reveal and next advance through a session', async ({ page }) => {
  await page.goto('/#/flashcards/nn')

  await expect(page.getByText('Card 0 / 1')).toBeVisible()
  await expect(page.getByText('ん', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Reveal' }).click()
  await expect(page.getByText('n', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Session complete!')).toBeVisible()
})
