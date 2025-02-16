import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Fukiya from "@shared/types/ability-types/skills/fukiya";
import Ninjato from "@shared/types/ability-types/skills/ninjato";
import GroundControl from "@shared/types/ability-types/skills/ground-control";
import Disguise from "@shared/types/ability-types/skills/disguise";
import Pyro from "@shared/types/ability-types/skills/pyro";
import Shuriken from "@shared/types/ability-types/skills/shuriken";
import NightCloak from "@shared/types/ability-types/skills/night-cloak";

export class NinjaDefault implements IAbilityGroup {
    static instance: NinjaDefault;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.NinjaDefault;
        this.abilityGroupType = AbilityGroupType.Default;
        this.abilities = [
            Fukiya.GetInstance().Get(),
            Ninjato.GetInstance().Get(),
            GroundControl.GetInstance().Get(),
            Disguise.GetInstance().Get(),
            Pyro.GetInstance().Get(),
            Shuriken.GetInstance().Get(),
            NightCloak.GetInstance().Get()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): NinjaDefault {
        if (!NinjaDefault.instance) {
            NinjaDefault.instance = new NinjaDefault();
        }
        return NinjaDefault.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return NinjaDefault.GetInstance() as T;
    }
}

export default NinjaDefault;
