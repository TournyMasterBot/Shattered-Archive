import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Haggle from "@shared/types/ability-types/skills/haggle";
import Staff from "@shared/types/ability-types/skills/staff";

export class CharlatanBasics implements IAbilityGroup {
    static instance: CharlatanBasics;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.CharlatanBasics;
        this.abilityGroupType = AbilityGroupType.Basics;
        this.abilities = [
            new Staff(),
            new Haggle()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): CharlatanBasics {
        if (!CharlatanBasics.instance) {
            CharlatanBasics.instance = new CharlatanBasics();
        }
        return CharlatanBasics.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return CharlatanBasics.GetInstance() as T;
    }
}

export default CharlatanBasics;
