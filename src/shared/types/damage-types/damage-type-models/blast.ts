import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Blast extends DamageType implements IDamageType {
    private static instance: Blast; 
    
    constructor() {
        super({
            id: "blast",
            name: "Blast",
            type: DslDamageType.Blast,
            resistanceCategories: [
            ]
        });
    }
    
    public static GetInstance(): Blast {
        if (!Blast.instance) {
            Blast.instance = new Blast();
        }
        return Blast.instance;
    }

    public Get<T>(): T {
        return Blast.GetInstance() as T;
    }
}

export default Blast;