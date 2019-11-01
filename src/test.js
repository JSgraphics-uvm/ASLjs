var test = 1;

class A {
    a = () => {
        
        test = 'a';
    }
}

class B {
    b = () => {
        console.log(test);
        test = 'b';
    }
}