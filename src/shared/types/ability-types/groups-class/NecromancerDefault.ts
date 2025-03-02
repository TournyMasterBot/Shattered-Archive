import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Combat from "../groups-spells/Combat";
import Detection from "../groups-spells/Detection";
import Enhancement from "@shared/types/ability-types/groups-spells/Enhancement";
import Maladictions from "../groups-spells/Maladictions";
import Necromancy from "../groups-spells/Necromancy";
import Transportation from "../groups-spells/Transportation";
import Astrology from "@shared/types/ability-types/skills/Astrology";
import ServerCache from "@shared/cache/server-cache";

export class NecromancerDefault implements IAbilityGroup {
  static instance: NecromancerDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.NecromancerDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Combat.GetInstance().abilities,
      ...Maladictions.GetInstance().abilities,
      ...Detection.GetInstance().abilities,
      ...Necromancy.GetInstance().abilities,
      ...Enhancement.GetInstance().abilities,
      ...Transportation.GetInstance().abilities,
      Astrology.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): NecromancerDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return NecromancerDefault.GetInstance() as T;
  }
}

export default NecromancerDefault;
