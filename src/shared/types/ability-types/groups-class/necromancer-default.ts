import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Combat from "../groups-spells/combat";
import Detection from "../groups-spells/detection";
import Enhancement from "@shared/types/ability-types/groups-spells/enhancement";
import Maladictions from "../groups-spells/maladictions";
import Necromancy from "../groups-spells/necromancy";
import Transportation from "../groups-spells/transportation";
import Astrology from "@shared/types/ability-types/skills/astrology";

export class NecromancerDefault implements IAbilityGroup {
  static instance: NecromancerDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.NecromancerDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Combat.GetInstance().Get<Combat>().abilities,
      ...Maladictions.GetInstance().Get<Maladictions>().abilities,
      ...Detection.GetInstance().Get<Detection>().abilities,
      ...Necromancy.GetInstance().Get<Necromancy>().abilities,
      ...Enhancement.GetInstance().Get<Enhancement>().abilities,
      ...Transportation.GetInstance().Get<Transportation>().abilities,
      Astrology.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): NecromancerDefault {
    if (!NecromancerDefault.instance) {
      NecromancerDefault.instance = new NecromancerDefault();
    }
    return NecromancerDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return NecromancerDefault.GetInstance() as T;
  }
}

export default NecromancerDefault;
