'use client';
import {useEffect,useState} from 'react';
import Sender from './sender';
import AutoSender from './auto-sender';
export default function SendEntry(){const [mode,setMode]=useState('');useEffect(()=>{setMode(new URLSearchParams(location.hash.slice(1)).has('t')?'private':'public');},[]);return mode==='private'?<Sender/>:mode==='public'?<AutoSender/>:<p className="notice">正在打开定位页…</p>;}
