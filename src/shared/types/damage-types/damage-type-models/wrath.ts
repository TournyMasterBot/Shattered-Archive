import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Wrath extends DamageType implements IDamageType {
    private static instance: Wrath; 
    
    constructor() {
        super({
            id: "wrath",
            name: "Wrath",
            type: DslDamageType.Wrath,
            resistanceCategories: [
            ]
        });
    }
    
    public static GetInstance(): Wrath {
        if (!Wrath.instance) {
            Wrath.instance = new Wrath();
        }
        return Wrath.instance;
    }

    public Get<T>(): T {
        return Wrath.GetInstance() as T;
    }
}

export default Wrath;