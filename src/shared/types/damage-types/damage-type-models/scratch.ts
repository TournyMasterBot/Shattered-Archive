import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Scratch extends DamageType implements IDamageType {
    private static instance: Scratch; 
    
    constructor() {
        super({
            id: "scratch",
            name: "Scratch",
            type: DslDamageType.Scratch,
            resistanceCategories: [
            ]
        });
    }
    
    public static GetInstance(): Scratch {
        if (!Scratch.instance) {
            Scratch.instance = new Scratch();
        }
        return Scratch.instance;
    }

    public Get<T>(): T {
        return Scratch.GetInstance() as T;
    }
}

export default Scratch;