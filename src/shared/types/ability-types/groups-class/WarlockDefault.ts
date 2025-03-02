import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Toss from "@shared/types/ability-types/skills/Toss";
import ApplyPotion from "@shared/types/ability-types/skills/ApplyPotion";
import Astrology from "@shared/types/ability-types/skills/Astrology";
import Brew from "@shared/types/ability-types/skills/Brew";
import Detection from "../groups-spells/Detection";
import Enhancement from "@shared/types/ability-types/groups-spells/Enhancement";
import Illusion from "../groups-spells/Illusion";
import Maladictions from "../groups-spells/Maladictions";
import Protective from "../groups-spells/Protective";
import Transportation from "../groups-spells/Transportation";
import Witchcraft from "../groups-spells/Witchcraft";
import ServerCache from "@shared/cache/server-cache";

export class WarlockDefault implements IAbilityGroup {
  static instance: WarlockDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.WarlockDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Detection.GetInstance().abilities,
      ...Protective.GetInstance().abilities,
      ...Enhancement.GetInstance().abilities,
      ...Illusion.GetInstance().abilities,
      ...Transportation.GetInstance().abilities,
      ...Witchcraft.GetInstance().abilities,
      ...Maladictions.GetInstance().abilities,
      Toss.GetInstance(),
      ApplyPotion.GetInstance(),
      Astrology.GetInstance(),
      Brew.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): WarlockDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WarlockDefault.GetInstance() as T;
  }
}

export default WarlockDefault;
