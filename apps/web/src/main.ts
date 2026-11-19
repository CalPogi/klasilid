import { mount } from 'svelte';
import App from './App.svelte';
import './styles/mockup.css';
import './styles/app.css';
import './styles/phone.css';
import './styles/admin.css';

mount(App, { target: document.getElementById('app')! });
