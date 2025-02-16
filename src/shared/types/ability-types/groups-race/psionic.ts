import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import PsionicBlast from "@shared/types/ability-types/spells/psionic-blast";

export class Psionic implements IAbilityGroup {
    static instance: Psionic;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.Psionic;
        this.abilityGroupType = AbilityGroupType.Race;
        this.abilities = [
            PsionicBlast.GetInstance().Get()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): Psionic {
        if (!Psionic.instance) {
            Psionic.instance = new Psionic();
        }
        return Psionic.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Psionic.GetInstance() as T;
    }
}

export default Psionic;
