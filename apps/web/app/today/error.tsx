"use client";
export default function TodayError({reset}:{error:Error;reset:()=>void}) {
  return <main style={{maxWidth:850,margin:"auto",padding:32,fontFamily:"system-ui"}}>
    <h1>Today is temporarily unavailable</h1><p>Your data has not been changed.</p>
    <button type="button" onClick={reset}>Try again</button>
  </main>;
}
