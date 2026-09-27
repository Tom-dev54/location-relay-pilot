'use client';
import {useEffect,useState} from 'react';
import PublicBoard from './public-board';
import DirectReceiver from './direct-receiver';
export default function Entry(){const [privateMode,setPrivateMode]=useState<boolean|null>(null);useEffect(()=>{const select=()=>setPrivateMode(new URLSearchParams(location.hash.slice(1)).has('receive'));select();window.addEventListener('hashchange',select);return()=>window.removeEventListener('hashchange',select);},[]);if(privateMode===null)return <p className="notice">正在打开定位页面…</p>;return privateMode?<main className="shell"><header className="top"><b>原接收入口 · 私人记录</b><a href="/">公开测试看板</a></header><DirectReceiver/></main>:<PublicBoard/>;}
