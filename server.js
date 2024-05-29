const OpenAI = require('openai');
const dotenv = require('dotenv');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const ejs = require('ejs');
dotenv.config();


const app = express();

app.use(express.json());
app.use('/resources', express.static(path.join(__dirname, 'resources')));

let journals = { prompts: [] };

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const routesRequiringJournals = ['/', '/journals', '/write', '/write/:id'];

const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).send('Internal Server Error');
};

app.use(errorHandler);

app.use(function (req, res, next) {
  if (routesRequiringJournals.includes(req.path)) {
    loadJournals()
      .then(() => next())
      .catch(next);
  } else {
    next();
  }
});

async function loadJournals() {
  try {
    const data = await fs.readFile('journals/journals.json', 'utf8');
    journals = data ? JSON.parse(data) : { prompts: [] };
    console.log('JSON data preloaded successfully!');
  } catch (error) {
    console.error('Error reading JSON file:', error);
    throw new Error('Failed to load journals data');
  }
}

async function saveJournals() {
  try {
    await fs.writeFile('journals/journals.json', JSON.stringify(journals, null, 2), 'utf8');
    console.log('Journals saved successfully!');
  } catch (error) { 
    if (error.code === 'ENOENT') {
      console.warn('Journals file does not exist. Creating a new one.');
      await fs.mkdir('journals', { recursive: true });
      await fs.writeFile('journals/journals.json', JSON.stringify(journals, null, 2), 'utf8');
      console.log('Journals file created successfully!');
    } else {
      console.error('Error writing JSON file:', error);
      throw error;
    }
  }
}

app.get('/', async function (req, res, next) {
  try {
    const indexHTML = await fs.readFile(path.join(__dirname, '/static/index.html'), 'utf8');
    const renderedHTML = ejs.render(indexHTML, {
      journalCount: journals.prompts.length.toString(),
      lastEntry: journals.prompts[journals.prompts.length - 1].date
    });
    res.send(renderedHTML);
  } catch (error) {
    next(error);
  }
});

app.get(['/write', '/write/:id'], async function (req, res, next) {
  try {
    const promptId = req.params.id;
    if (Object.keys(journals).length === 0) await loadJournals();
    const prompt = journals.prompts.find(prompt => prompt.id === promptId);
    const template = await fs.readFile(path.join(__dirname, '/static/write.html'), 'utf8');
    const data = {
      prompt: prompt ? `${prompt.date}\n\n${prompt.prompt}` : ''
    };
    const renderedHtml = ejs.render(template, data);
    res.send(renderedHtml);
  } catch (error) {
    next(error);
  }
});

app.get('/journals', async function (req, res, next) {
  try {
    if (Object.keys(journals).length === 0) await loadJournals();
    fetchStoriesAsync(journals.prompts)
      .then(async () => {
        const renderedHtml = await ejs.renderFile(path.join(__dirname, '/static/journals.html'), { prompts: journals.prompts });
        res.send(renderedHtml);
      })
      .catch(next);
  } catch (error) {
    next(error);
  }
});

async function fetchStoriesAsync(prompts) {
  await Promise.all(prompts.map(async (prompt) => {
    if (!prompt.story) {
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            "role": "system",
            "content": "Using natural conversational language. Summarize this story in third person. Keep it short, maximum three sentences."
          },
          {
            "role": "user",
            "content": prompt.prompt
          }
        ],
        temperature: 1,
        max_tokens: 256,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      });

      prompt.story = response.choices[0].message.content;
    }
  }));

  console.log("Stories fetched and updated successfully.");
  await saveJournals();
}

const { body, validationResult } = require('express-validator');

const validationRules = [
  body('prompt').isString().trim().notEmpty(),
];

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

app.post('/write/save', validationRules, validate, async (req, res, next) => {
  try {
    const newPrompt = req.body;
    const promptId = req.params.id;
    if (promptId) {
      const existingPromptIndex = journals.prompts.findIndex(prompt => prompt.id === promptId);
      if (existingPromptIndex !== -1) {
        journals.prompts[existingPromptIndex] = newPrompt;
        await saveJournals();
        console.log('Prompt updated successfully!');
        res.status(200).send('Prompt updated successfully!');
      } else {
        res.status(404).send('Prompt not found');
      }
    } else {
      const id = generateRandomId();
      newPrompt.id = id;
      journals.prompts.push(newPrompt);
      await saveJournals();
      console.log('Prompt added successfully!');
      res.status(200).send('Prompt added successfully!');
    }
  } catch (error) {
    console.error('Error:', error);
    next(error);
  }
});

function generateRandomId() {
  return Math.random().toString(36).substr(2, 9);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
