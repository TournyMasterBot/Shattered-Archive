import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Bite extends DamageType implements IDamageType {
    private static instance: Bite; 
    
    constructor() {
        super({
            id: "bite",
            name: "Bite",
            type: DslDamageType.Bite,
            resistanceCategories: [
            ]
        });
    }
    
    public static GetInstance(): Bite {
        if (!Bite.instance) {
            Bite.instance = new Bite();
        }
        return Bite.instance;
    }

    public Get<T>(): T {
        return Bite.GetInstance() as T;
    }
}

export default Bite;