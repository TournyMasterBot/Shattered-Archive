export interface IBoostedClass {
    DamageModifier: number | undefined;
    SaveModifier: number | undefined;
    Thac0Modifier: number | undefined;
}

class BoostedClass implements IBoostedClass {
    DamageModifier: number | undefined;
    SaveModifier: number | undefined;
    Thac0Modifier: number | undefined;
    
    constructor(input: Partial<BoostedClass>) {
        this.DamageModifier = input.DamageModifier;
        this.SaveModifier = input.SaveModifier;
        this.Thac0Modifier = input.Thac0Modifier;
    }
}

export default BoostedClass;