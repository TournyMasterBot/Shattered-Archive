import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Staff from "@shared/types/ability-types/skills/staff";

export class BrewmasterBasics implements IAbilityGroup {
    static instance: BrewmasterBasics;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.BrewmasterBasics;
        this.abilityGroupType = AbilityGroupType.Basics;
        this.abilities = [
            new Staff()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): BrewmasterBasics {
        if (!BrewmasterBasics.instance) {
            BrewmasterBasics.instance = new BrewmasterBasics();
        }
        return BrewmasterBasics.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return BrewmasterBasics.GetInstance() as T;
    }
}

export default BrewmasterBasics;
