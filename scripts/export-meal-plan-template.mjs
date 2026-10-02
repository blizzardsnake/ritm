import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { MEAL_PLAN_EXAMPLE, parseMealPlan } from '../frontend/src/lib/personal/meal-plan.js'
const path = resolve(process.argv[2] || 'opengym-meal-plan-template.json')
const json = JSON.stringify(MEAL_PLAN_EXAMPLE, null, 2) + '\n'
parseMealPlan(json)
await mkdir(dirname(path), { recursive: true })
await writeFile(path, json, 'utf8')
console.log(path)
