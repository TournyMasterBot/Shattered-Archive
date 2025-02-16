import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Riding from "@shared/types/ability-types/skills/riding";
import Broadswing from "@shared/types/ability-types/skills/broadswing";
import Polearm from "@shared/types/ability-types/skills/polearm";
import UnholyRapture from "@shared/types/ability-types/skills/unholy-rapture";
import ShieldDisarm from "@shared/types/ability-types/skills/shield-disarm";
import Benedictions from "@shared/types/ability-types/groups-spells/benedictions";
import Curative from "@shared/types/ability-types/groups-spells/curative";
import Healing from "../groups-spells/healing";
import Unholy from "../groups-spells/unholy";

export class ShadowknightDefault implements IAbilityGroup {
    static instance: ShadowknightDefault;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.ShadowknightDefault;
        this.abilityGroupType = AbilityGroupType.Default;
        this.abilities = [
            ...Healing.GetInstance().Get<Healing>().abilities,
            ...Curative.GetInstance().Get<Curative>().abilities,
            ...Unholy.GetInstance().Get<Unholy>().abilities,
            ...Benedictions.GetInstance().Get<Benedictions>().abilities,
            Riding.GetInstance().Get(),
            Broadswing.GetInstance().Get(),
            Polearm.GetInstance().Get(),
            UnholyRapture.GetInstance().Get(),
            ShieldDisarm.GetInstance().Get()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): ShadowknightDefault {
        if (!ShadowknightDefault.instance) {
            ShadowknightDefault.instance = new ShadowknightDefault();
        }
        return ShadowknightDefault.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return ShadowknightDefault.GetInstance() as T;
    }
}

export default ShadowknightDefault;
