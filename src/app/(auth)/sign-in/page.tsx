import { auth } from "@/lib/auth";
import { SignInView } from "@/modules/auth/ui/views/sign-in-view";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const Page = async () => {
    const session = await auth.api.getSession({
        headers: await headers(),
      })
    
      if(!!session){
        redirect("/")
      }
    return <SignInView/>
}

export default Page;

/* 

The url to load this page is http://localhost:3000/sign-in

We can see that (auth) folder should also come but it not coming as
it is under the small brackets. That's why these brackets are used

*/