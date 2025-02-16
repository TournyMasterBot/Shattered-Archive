import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Cleave extends DamageType implements IDamageType {
    private static instance: Cleave; 
    
    constructor() {
        super({
            id: "cleave",
            name: "Cleave",
            type: DslDamageType.Cleave,
            resistanceCategories: [
            ]
        });
    }
    
    public static GetInstance(): Cleave {
        if (!Cleave.instance) {
            Cleave.instance = new Cleave();
        }
        return Cleave.instance;
    }

    public Get<T>(): T {
        return Cleave.GetInstance() as T;
    }
}

export default Cleave;