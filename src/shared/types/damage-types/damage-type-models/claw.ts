import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Claw extends DamageType implements IDamageType {
    private static instance: Claw; 
    
    constructor() {
        super({
            id: "claw",
            name: "Claw",
            type: DslDamageType.Claw,
            resistanceCategories: [
            ]
        });
    }
    
    public static GetInstance(): Claw {
        if (!Claw.instance) {
            Claw.instance = new Claw();
        }
        return Claw.instance;
    }

    public Get<T>(): T {
        return Claw.GetInstance() as T;
    }
}

export default Claw;