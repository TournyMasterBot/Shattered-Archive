import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Suction extends DamageType implements IDamageType {
    private static instance: Suction; 
    
    constructor() {
        super({
            id: "suction",
            name: "Suction",
            type: DslDamageType.Suction,
            resistanceCategories: [
            ]
        });
    }
    
    public static GetInstance(): Suction {
        if (!Suction.instance) {
            Suction.instance = new Suction();
        }
        return Suction.instance;
    }

    public Get<T>(): T {
        return Suction.GetInstance() as T;
    }
}

export default Suction;