import express from 'express'
 const app = express()
 const PORT=8000


//http://localhost:8000
app.get('/',(req,res)=>{
    res.send ({message:"server is runnig fine!"})

}
)

 app.listen(PORT,()=>{
    console.log(`Server is running at ${PORT}`);
 })