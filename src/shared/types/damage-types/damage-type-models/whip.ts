import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Whip extends DamageType implements IDamageType {
    private static instance: Whip; 
    
    constructor() {
        super({
            id: "whip",
            name: "Whip",
            type: DslDamageType.Whip,
            resistanceCategories: [
            ]
        });
    }
    
    public static GetInstance(): Whip {
        if (!Whip.instance) {
            Whip.instance = new Whip();
        }
        return Whip.instance;
    }

    public Get<T>(): T {
        return Whip.GetInstance() as T;
    }
}

export default Whip;