import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Smash extends DamageType implements IDamageType {
    private static instance: Smash; 
    
    constructor() {
        super({
            id: "smash",
            name: "Smash",
            type: DslDamageType.Smash,
            resistanceCategories: [
            ]
        });
    }
    
    public static GetInstance(): Smash {
        if (!Smash.instance) {
            Smash.instance = new Smash();
        }
        return Smash.instance;
    }

    public Get<T>(): T {
        return Smash.GetInstance() as T;
    }
}

export default Smash;