// Runs only in the successful main-branch workflow, with a job-scoped token.
const { GITHUB_REPOSITORY: repository, GITHUB_SHA: sha, GITHUB_TOKEN: token } = process.env;
if (!repository || !/^[a-f0-9]{40}$/.test(sha || "") || !token || process.env.GITHUB_REF !== "refs/heads/main") {
  throw new Error("A verified main-branch workflow is required");
}
async function api(path, options={}) {
  const response=await fetch(`https://api.github.com/repos/${repository}/${path}`,{
    ...options, headers:{Accept:"application/vnd.github+json",Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
  });
  if(response.status===404)return null;
  if(!response.ok)throw new Error("Release update failed: HTTP "+response.status);
  return response.json();
}
const latest=await api("git/ref/heads/main");
if(latest?.object.sha!==sha){console.log("A newer commit is being checked; release unchanged.");process.exit(0);}
const current=await api("git/ref/heads/release");
if(current?.object.sha===sha){console.log("Release already points to the verified commit.");process.exit(0);}
const result=current
 ? await api("git/refs/heads/release",{method:"PATCH",body:JSON.stringify({sha,force:false})})
 : await api("git/refs",{method:"POST",body:JSON.stringify({ref:"refs/heads/release",sha})});
if(result?.object.sha!==sha)throw new Error("Release verification failed");
console.log("Verified source is available on release.");
