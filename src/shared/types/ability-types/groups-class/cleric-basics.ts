import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Mace from "@shared/types/ability-types/skills/mace";

export class ClericBasics implements IAbilityGroup {
    static instance: ClericBasics;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.ClericBasics;
        this.abilityGroupType = AbilityGroupType.Basics;
        this.abilities = [
            new Mace()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): ClericBasics {
        if (!ClericBasics.instance) {
            ClericBasics.instance = new ClericBasics();
        }
        return ClericBasics.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return ClericBasics.GetInstance() as T;
    }
}

export default ClericBasics;
