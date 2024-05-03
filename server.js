const OpenAI = require('openai');
const dotenv = require('dotenv');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
dotenv.config(); // Load environment variables from .env file

const app = express();

app.use(express.json());
app.use('/resources', express.static(path.join(__dirname, 'resources')));

let journals = { prompts: [] }; 

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const routesRequiringJournals = ['/journals', '/write', '/write/:id'];

app.use(function (req, res, next) {
  if (routesRequiringJournals.includes(req.path)) {
    loadJournals()
      .then(() => next())
      .catch(error => {
        console.error('Error loading journals:', error.message);
        res.status(500).send('Failed to load journals');
      });
  } else {
    next();
  }
});


async function loadJournals() {
  try {
    const data = await fs.readFile('journals/journals.json', 'utf8');
    if (data) {
      journals = JSON.parse(data);
    } else {
      journals = { prompts: [] };
    }
    console.log('JSON data preloaded successfully!');
  } catch (error) {
    console.error('Error reading JSON file:', error);
    throw new Error('Failed to load journals data'); 
  }
}

async function saveJournals() {
  let fileHandle;
  try {
    fileHandle = await fs.open('journals/journals.json', 'r+');
    await fileHandle.writeFile(JSON.stringify(journals, null, 2), 'utf8');
    
    console.log('Journals saved successfully!');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn('Journals file does not exist. Creating a new one.');
      fileHandle = await fs.open('journals/journals.json', 'wx');
      await fileHandle.writeFile(JSON.stringify(journals, null, 2), 'utf8');
      console.log('Journals file created successfully!');
    } else {
      console.error('Error writing JSON file:', error);
      throw error;
    }
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
  }
}

app.get('/', async function (req, res) {
  try {
    let indexHTML = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
    indexHTML = indexHTML.replace("<!--journal count-->", journals.prompts.length.toString());
    if (journals.prompts.length > 0) {
      indexHTML = indexHTML.replace("<!--last count-->", journals.prompts[journals.prompts.length - 1].date);
    } else {
      indexHTML = indexHTML.replace("<!--last count-->", "No journals available");
    }
    res.send(indexHTML);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal Server Error');
  }
});


app.get('/write', function (req, res) {
  res.sendFile(path.join(__dirname, 'write.html'));
});

app.get('/journals', async function (req, res) {
  try {
    if (Object.keys(journals).length === 0) await loadJournals();
    const html = await fs.readFile(path.join(__dirname, 'journals.html'), 'utf8');

    console.log("Fetching stories...");
    fetchStoriesAsync(journals.prompts)
      .then(async () => {
        console.log("Stories fetched successfully.");
        const renderedHtml = journals.prompts.map(prompt => {
          return `<a href="/write/${prompt.id}"><div class="entry">${prompt.date}<p>${prompt.story}</p></div></a>`;
        }).join('');

        const finalHtml = html.replace('<!-- Item boxes will be added here dynamically -->', renderedHtml);
        res.send(finalHtml);
      })
      .catch(error => {
        console.error('Error fetching stories:', error);
        res.status(500).send('Error fetching stories');
      });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal Server Error');
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

app.get('/write/:id', async function (req, res) {
  const promptId = req.params.id;
  if (Object.keys(journals).length === 0) await loadJournals();
  const prompt = journals.prompts.find(prompt => prompt.id === promptId);
  const html = await fs.readFile(path.join(__dirname, 'write.html'), 'utf8');
  const renderedHtml = prompt ? html.replace('<textarea id="diary" placeholder="just type..." spellcheck="false"></textarea>', `<textarea id="diary" placeholder="just type..." spellcheck="false">${prompt.date + "\n\n" + prompt.prompt}</textarea>`) : html;
  res.send(renderedHtml);
});

app.post('/write/save', async (req, res) => {
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
    res.status(500).send('Internal Server Error');
  }
});

function generateRandomId() {
  return Math.random().toString(36).substr(2, 9);
}

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
